package com.example.AnimaClub.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.servlet.config.annotation.CorsRegistration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Map;

@Configuration
public class WebSecurityConfig implements WebMvcConfigurer {

    private final AccountAuthorizationInterceptor accountAuthorizationInterceptor;

    public WebSecurityConfig(AccountAuthorizationInterceptor accountAuthorizationInterceptor) {
        this.accountAuthorizationInterceptor = accountAuthorizationInterceptor;
    }

    @Value("${app.cors.allowed-origins:http://localhost:4200}")
    private String[] allowedOrigins;

    @Value("${app.cors.allowed-origin-patterns:}")
    private String[] allowedOriginPatterns;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (!hasConfiguredValues(allowedOrigins) && !hasConfiguredValues(allowedOriginPatterns)) {
            return;
        }

        CorsRegistration registration = registry.addMapping("/**")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);

        if (hasConfiguredValues(allowedOriginPatterns)) {
            registration.allowedOriginPatterns(allowedOriginPatterns);
        } else {
            registration.allowedOrigins(allowedOrigins);
        }
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(accountAuthorizationInterceptor);
    }

    private boolean hasConfiguredValues(String[] values) {
        if (values == null) {
            return false;
        }

        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return true;
            }
        }

        return false;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        String defaultEncoder = "argon2id";
        Map<String, PasswordEncoder> encoders = Map.of(
                defaultEncoder, Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8(),
                "bcrypt", new BCryptPasswordEncoder(12)
        );

        DelegatingPasswordEncoder passwordEncoder = new DelegatingPasswordEncoder(defaultEncoder, encoders);
        passwordEncoder.setDefaultPasswordEncoderForMatches(new BCryptPasswordEncoder());
        return passwordEncoder;
    }
}
