import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.StringJoiner;

public class H2ToPostgresMigrator {
    private static final int BATCH_SIZE = 500;
    private static final List<String> TABLES = List.of(
            "compte",
            "anime_catalog_entry",
            "anime_weekly_ranking",
            "character_catalog_entry",
            "account_follow",
            "anime_library_entry",
            "manga_library_entry",
            "feed_activity_like",
            "account_notification",
            "account_message",
            "anime_character_appearance",
            "translation_cache_entry"
    );

    public static void main(String[] args) throws Exception {
        Config config = Config.fromArgs(args);
        Class.forName("org.h2.Driver");
        Class.forName("org.postgresql.Driver");

        try (
                Connection h2 = DriverManager.getConnection(config.h2Url(), config.h2User(), config.h2Password());
                Connection pg = DriverManager.getConnection(config.pgUrl(), config.pgUser(), config.pgPassword())
        ) {
            pg.setAutoCommit(false);

            if (config.replace()) {
                truncateTarget(pg);
            }

            for (String table : TABLES) {
                if (!sourceTableExists(h2, table)) {
                    System.out.println("SKIP " + table + " absent dans H2");
                    continue;
                }
                if (!targetTableExists(pg, table)) {
                    long sourceRows = countRows(h2, table);
                    if (sourceRows == 0) {
                        System.out.println("SKIP " + table + " absent dans PostgreSQL et vide dans H2");
                        continue;
                    }
                    throw new IllegalStateException("Table PostgreSQL manquante: " + table);
                }

                copyTable(h2, pg, table);
                resetIdentity(pg, table);
                pg.commit();
            }
        }
    }

    private static void truncateTarget(Connection pg) throws SQLException {
        try (Statement statement = pg.createStatement()) {
            statement.execute("""
                    TRUNCATE TABLE
                        translation_cache_entry,
                        anime_character_appearance,
                        account_message,
                        account_notification,
                        feed_activity_like,
                        manga_library_entry,
                        anime_library_entry,
                        account_follow,
                        character_catalog_entry,
                        anime_weekly_ranking,
                        anime_catalog_entry,
                        compte
                    RESTART IDENTITY CASCADE
                    """);
            pg.commit();
        }
    }

    private static void copyTable(Connection h2, Connection pg, String table) throws SQLException {
        List<String> columns = sourceColumns(h2, table);
        String selectSql = "SELECT " + String.join(", ", columns) + " FROM " + table + " ORDER BY id";
        String insertSql = insertSql(table, columns);
        long copied = 0;

        try (
                Statement select = h2.createStatement(ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY);
                ResultSet rows = select.executeQuery(selectSql);
                PreparedStatement insert = pg.prepareStatement(insertSql)
        ) {
            ResultSetMetaData metadata = rows.getMetaData();
            int pending = 0;

            while (rows.next()) {
                for (int index = 1; index <= columns.size(); index++) {
                    setValue(insert, index, rows, metadata);
                }

                insert.addBatch();
                pending++;
                copied++;

                if (pending >= BATCH_SIZE) {
                    insert.executeBatch();
                    pending = 0;
                    if (copied % 5000 == 0) {
                        System.out.println(table + ": " + copied);
                    }
                }
            }

            if (pending > 0) {
                insert.executeBatch();
            }
        }

        System.out.println(table + ": " + copied + " lignes");
    }

    private static List<String> sourceColumns(Connection h2, String table) throws SQLException {
        List<String> columns = new ArrayList<>();
        String sql = """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = ?
                ORDER BY ordinal_position
                """;

        try (PreparedStatement statement = h2.prepareStatement(sql)) {
            statement.setString(1, table);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    columns.add(result.getString(1));
                }
            }
        }

        return columns;
    }

    private static String insertSql(String table, List<String> columns) {
        StringJoiner names = new StringJoiner(", ");
        StringJoiner placeholders = new StringJoiner(", ");
        for (String column : columns) {
            names.add(column);
            placeholders.add("?");
        }

        return "INSERT INTO " + table + " (" + names + ") VALUES (" + placeholders + ")";
    }

    private static void setValue(PreparedStatement insert, int index, ResultSet rows, ResultSetMetaData metadata)
            throws SQLException {
        Object value = rows.getObject(index);
        if (value == null) {
            insert.setNull(index, pgNullType(metadata.getColumnType(index)));
            return;
        }

        int columnType = metadata.getColumnType(index);
        if (value instanceof byte[] bytes) {
            insert.setBytes(index, bytes);
        } else if (columnType == Types.BINARY || columnType == Types.VARBINARY || columnType == Types.LONGVARBINARY) {
            insert.setBytes(index, rows.getBytes(index));
        } else if (value instanceof OffsetDateTime offsetDateTime) {
            insert.setObject(index, offsetDateTime);
        } else if (columnType == Types.OTHER) {
            insert.setString(index, value.toString());
        } else {
            insert.setObject(index, value);
        }
    }

    private static int pgNullType(int sourceType) {
        return switch (sourceType) {
            case Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY, Types.BLOB -> Types.BINARY;
            case Types.TIMESTAMP, Types.TIMESTAMP_WITH_TIMEZONE -> Types.TIMESTAMP_WITH_TIMEZONE;
            case Types.BOOLEAN, Types.BIT -> Types.BOOLEAN;
            case Types.INTEGER, Types.SMALLINT, Types.TINYINT -> Types.INTEGER;
            case Types.DOUBLE, Types.FLOAT, Types.REAL, Types.NUMERIC, Types.DECIMAL -> Types.DOUBLE;
            default -> Types.VARCHAR;
        };
    }

    private static void resetIdentity(Connection pg, String table) throws SQLException {
        String sql = """
                SELECT setval(
                    pg_get_serial_sequence('public.%s', 'id'),
                    COALESCE((SELECT MAX(id) FROM %s), 1),
                    (SELECT COUNT(*) > 0 FROM %s)
                )
                """.formatted(table, table, table);

        try (Statement statement = pg.createStatement()) {
            statement.execute(sql);
        }
    }

    private static boolean sourceTableExists(Connection connection, String table) throws SQLException {
        String sql = """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = ?
                """;
        return scalarCount(connection, sql, table) > 0;
    }

    private static boolean targetTableExists(Connection connection, String table) throws SQLException {
        String sql = """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = ?
                """;
        return scalarCount(connection, sql, table) > 0;
    }

    private static long countRows(Connection connection, String table) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM " + table)) {
            result.next();
            return result.getLong(1);
        }
    }

    private static long scalarCount(Connection connection, String sql, String value) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, value.toLowerCase(Locale.ROOT));
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getLong(1);
            }
        }
    }

    private record Config(
            String h2Url,
            String h2User,
            String h2Password,
            String pgUrl,
            String pgUser,
            String pgPassword,
            boolean replace
    ) {
        static Config fromArgs(String[] args) {
            String h2Url = "jdbc:h2:file:./data/animaclub-local;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;IFEXISTS=TRUE;ACCESS_MODE_DATA=r";
            String h2User = "sa";
            String h2Password = "";
            String pgUrl = "jdbc:postgresql://127.0.0.1:5432/animeclub?reWriteBatchedInserts=true";
            String pgUser = "animeclub";
            String pgPassword = "animeclub";
            boolean replace = false;

            for (String arg : args) {
                if (arg.equals("--replace")) {
                    replace = true;
                } else if (arg.startsWith("--h2-url=")) {
                    h2Url = arg.substring("--h2-url=".length());
                } else if (arg.startsWith("--h2-user=")) {
                    h2User = arg.substring("--h2-user=".length());
                } else if (arg.startsWith("--h2-password=")) {
                    h2Password = arg.substring("--h2-password=".length());
                } else if (arg.startsWith("--pg-url=")) {
                    pgUrl = arg.substring("--pg-url=".length());
                } else if (arg.startsWith("--pg-user=")) {
                    pgUser = arg.substring("--pg-user=".length());
                } else if (arg.startsWith("--pg-password=")) {
                    pgPassword = arg.substring("--pg-password=".length());
                } else {
                    throw new IllegalArgumentException("Argument inconnu: " + arg);
                }
            }

            return new Config(h2Url, h2User, h2Password, pgUrl, pgUser, pgPassword, replace);
        }
    }
}
