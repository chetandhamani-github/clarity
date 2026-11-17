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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceImplTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AuthServiceImpl authService;

    private User existingUser;

    @BeforeEach
    void setUp() {
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
    @DisplayName("authenticateWithGoogle creates new user if user does not exist")
    void shouldCreateNewUserWhenNotExists() {
        when(userRepository.findByEmail("bob@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .idToken("mock-token")
                .email("bob@gmail.com")
                .name("Bob")
                .avatarUrl("https://photo.jpg")
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
        when(userRepository.findByEmail("alice@gmail.com")).thenReturn(Optional.of(existingUser));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GoogleAuthRequest request = GoogleAuthRequest.builder()
                .idToken("mock-token")
                .email("alice@gmail.com")
                .name("Alice Updated")
                .build();

        AuthResponse response = authService.authenticateWithGoogle(request);

        assertThat(response).isNotNull();
        assertThat(response.getToken()).startsWith("clr_");
        assertThat(response.getUser().getName()).isEqualTo("Alice Updated");
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
