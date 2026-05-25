package com.example.AnimaClub.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ApiExceptionHandlerTests {

    private MockMvc mockMvc() {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();

        return MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(new ApiExceptionHandler())
                .setValidator(validator)
                .build();
    }

    @Test
    void responseStatusExceptionKeepsStatusAndMessage() throws Exception {
        mockMvc().perform(get("/probe/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message").value("Probe introuvable."));
    }

    @Test
    void illegalArgumentIsBadRequestJson() throws Exception {
        mockMvc().perform(get("/probe/bad-request"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message").value("Valeur invalide."));
    }

    @Test
    void validationErrorUsesFieldMessage() throws Exception {
        mockMvc().perform(post("/probe/validation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message").value("name Le nom est requis."));
    }

    @Test
    void malformedJsonReturnsStableMessage() throws Exception {
        mockMvc().perform(post("/probe/validation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message").value("Requete JSON invalide."));
    }

    @Test
    void genericExceptionIsServerErrorWithoutDetails() throws Exception {
        mockMvc().perform(get("/probe/error"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message").value("Erreur serveur."));
    }

    @RestController
    private static class ProbeController {

        @GetMapping("/probe/not-found")
        void notFound() {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Probe introuvable.");
        }

        @GetMapping("/probe/bad-request")
        void badRequest() {
            throw new IllegalArgumentException("Valeur invalide.");
        }

        @PostMapping("/probe/validation")
        void validation(@Valid @RequestBody ProbeRequest request) {
        }

        @GetMapping("/probe/error")
        void error() {
            throw new RuntimeException("internal secret");
        }
    }

    private record ProbeRequest(@NotBlank(message = "Le nom est requis.") String name) {
    }
}
