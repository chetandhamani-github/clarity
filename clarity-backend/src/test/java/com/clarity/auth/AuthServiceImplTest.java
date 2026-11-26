package com.clarity.auth;

import com.clarity.auth.dto.AuthResponse;
import com.clarity.auth.dto.GoogleAuthRequest;
import com.clarity.auth.dto.UserDTO;
import com.clarity.auth.entity.User;
import com.clarity.auth.repository.UserRepository;
import com.clarity.auth.service.AuthServiceImpl;
import com.clarity.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceImplTest {

    private static final String TEST_CLIENT_ID = "clarity-client-id.apps.googleusercontent.com";

    @Mock
    private UserRepository userRepository;

    private RestTemplate restTemplate;
    private AuthServiceImpl authService;
    private User existingUser;

    @BeforeEach
    void setUp() {
        restTemplate = mock(RestTemplate.class);
        authService = new AuthServiceImpl(userRepository, restTemplate, false, TEST_CLIENT_ID);
        existingUser = User.builder()
                .id(UUID.randomUUID())
                .email("alice@gmail.com")
                .name("Alice")
                .authToken("clr_existing_token")
                .status("ACTIVE")
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .lastLoginAt(Instant.now())
                .build();
    }

    @Test
    @DisplayName("authenticateWithGoogle creates new user when Google tokeninfo verifies token")
    void shouldCreateNewUserWhenNotExists() {
        when(restTemplate.getForObject(contains("id_token=valid-token"), eq(Map.class)))
                .thenReturn(Map.of(
                        "email", "bob@gmail.com",
                        "email_verified", "true",
                        "name", "Bob",
                        "picture", "https://photo.jpg",
                        "sub", "google-sub-bob",
                        "aud", TEST_CLIENT_ID
                ));
        when(userRepository.findByEmail("bob@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .idToken("valid-token")
                .email("spoofed@evil.com")
                .name("Ignored")
                .build();

        AuthResponse response = authService.authenticateWithGoogle(request);

        assertThat(response).isNotNull();
        assertThat(response.getToken()).startsWith("clr_");
        assertThat(response.getUser().getEmail()).isEqualTo("bob@gmail.com");
        assertThat(response.getUser().getName()).isEqualTo("Bob");
    }

    @Test
    @DisplayName("authenticateWithGoogle updates existing user and returns new token")
    void shouldUpdateExistingUser() {
        when(restTemplate.getForObject(contains("id_token=alice-token"), eq(Map.class)))
                .thenReturn(Map.of(
                        "email", "alice@gmail.com",
                        "email_verified", true,
                        "name", "Alice Updated",
                        "aud", TEST_CLIENT_ID
                ));
        when(userRepository.findByEmail("alice@gmail.com")).thenReturn(Optional.of(existingUser));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .idToken("alice-token")
                .email("alice@gmail.com")
                .name("Alice Updated")
                .build();

        AuthResponse response = authService.authenticateWithGoogle(request);

        assertThat(response).isNotNull();
        assertThat(response.getToken()).startsWith("clr_");
        assertThat(response.getUser().getName()).isEqualTo("Alice Updated");
    }

    @Test
    @DisplayName("authenticateWithGoogle rejects unverified token when fallback disabled")
    void shouldRejectUnverifiedTokenInStrictMode() {
        when(restTemplate.getForObject(contains("id_token=forged-token"), eq(Map.class)))
                .thenThrow(new RestClientException("400 Bad Request"));

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .idToken("forged-token")
                .email("victim@gmail.com")
                .name("Victim")
                .build();

        assertThatThrownBy(() -> authService.authenticateWithGoogle(request))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getStatus())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("authenticateWithGoogle rejects Google token with mismatched audience")
    void shouldRejectAudienceMismatch() {
        when(restTemplate.getForObject(contains("id_token=other-app-token"), eq(Map.class)))
                .thenReturn(Map.of(
                        "email", "bob@gmail.com",
                        "email_verified", "true",
                        "aud", "some-other-client-id"
                ));

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .idToken("other-app-token")
                .build();

        assertThatThrownBy(() -> authService.authenticateWithGoogle(request))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("audience");
    }

    @Test
    @DisplayName("authenticateWithGoogle allows fallback only when explicitly enabled")
    void shouldAllowFallbackOnlyWhenEnabled() {
        AuthServiceImpl devAuthService = new AuthServiceImpl(userRepository, restTemplate, true, "");
        when(userRepository.findByEmail("dev@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .email("dev@gmail.com")
                .name("Dev User")
                .build();

        AuthResponse response = devAuthService.authenticateWithGoogle(request);
        assertThat(response.getUser().getEmail()).isEqualTo("dev@gmail.com");
    }

    @Test
    @DisplayName("getCurrentUser throws 401 when token invalid")
    void shouldThrowWhenTokenInvalid() {
        when(userRepository.findByAuthToken("invalid-token")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.getCurrentUser("Bearer invalid-token"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Invalid or expired session token");
    }

    @Test
    @DisplayName("getCurrentUser returns user when token valid")
    void shouldReturnUserWhenTokenValid() {
        when(userRepository.findByAuthToken("valid-token")).thenReturn(Optional.of(existingUser));

        UserDTO userDTO = authService.getCurrentUser("Bearer valid-token");

        assertThat(userDTO.getEmail()).isEqualTo("alice@gmail.com");
    }
}
