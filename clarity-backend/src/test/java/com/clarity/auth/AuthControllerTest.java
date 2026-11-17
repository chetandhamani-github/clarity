package com.clarity.auth;

import com.clarity.auth.controller.AuthController;
import com.clarity.auth.dto.AuthResponse;
import com.clarity.auth.dto.GoogleAuthRequest;
import com.clarity.auth.dto.UserDTO;
import com.clarity.auth.service.AuthService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthService authService;

    @Test
    @DisplayName("POST /api/v1/auth/google should return 200 with session token and user")
    void shouldAuthenticateWithGoogleSuccessfully() throws Exception {
        UserDTO userDTO = UserDTO.builder()
                .id(UUID.randomUUID())
                .email("test@example.com")
                .name("Test User")
                .avatarUrl("https://example.com/photo.jpg")
                .createdAt(Instant.now())
                .build();

        AuthResponse authResponse = AuthResponse.builder()
                .token("clr_1234567890abcdef")
                .user(userDTO)
                .build();

        when(authService.authenticateWithGoogle(any(GoogleAuthRequest.class))).thenReturn(authResponse);

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .idToken("mock-google-id-token")
                .email("test@example.com")
                .name("Test User")
                .build();

        mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("clr_1234567890abcdef"))
                .andExpect(jsonPath("$.user.email").value("test@example.com"))
                .andExpect(jsonPath("$.user.name").value("Test User"));
    }

    @Test
    @DisplayName("GET /api/v1/auth/me should return current user when token provided")
    void shouldReturnCurrentUser() throws Exception {
        UserDTO userDTO = UserDTO.builder()
                .id(UUID.randomUUID())
                .email("test@example.com")
                .name("Test User")
                .build();

        when(authService.getCurrentUser("Bearer clr_token")).thenReturn(userDTO);

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer clr_token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("test@example.com"))
                .andExpect(jsonPath("$.name").value("Test User"));
    }
}
