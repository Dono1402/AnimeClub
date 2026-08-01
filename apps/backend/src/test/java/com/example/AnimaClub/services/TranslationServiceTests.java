package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.TranslationResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TranslationServiceTests {

    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void translatesWithGoogleFirst() {
        server.createContext("/google", exchange -> respond(exchange, 200, "[[[\"Bonjour le monde\",\"Hello world\"]]]"));

        TranslationResponse response = service().translate("Hello world.", "en", "fr");

        assertEquals("Bonjour le monde", response.translatedText());
        assertEquals("google", response.provider());
    }

    @Test
    void fallsBackToMyMemoryWhenGoogleIsUnavailable() {
        server.createContext("/google", exchange -> respond(exchange, 503, "{}"));
        server.createContext(
                "/memory",
                exchange -> respond(exchange, 200, "{\"responseStatus\":200,\"responseData\":{\"translatedText\":\"Bonjour &amp; bienvenue\"}}")
        );

        TranslationResponse response = service().translate("Hello and welcome.", "en", "fr");

        assertEquals("Bonjour & bienvenue", response.translatedText());
        assertEquals("mymemory", response.provider());
    }

    private TranslationService service() {
        return new TranslationService(
                new ObjectMapper(),
                HttpClient.newHttpClient(),
                baseUrl + "/google",
                baseUrl + "/memory"
        );
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
