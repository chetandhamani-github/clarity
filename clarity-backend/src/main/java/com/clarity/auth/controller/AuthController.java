package com.clarity.auth.controller;

import com.clarity.auth.dto.AuthResponse;
import com.clarity.auth.dto.GoogleAuthRequest;
import com.clarity.auth.dto.UserDTO;
import com.clarity.auth.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "User authentication and profile endpoints")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/google")
    @Operation(summary = "Authenticate with Google", description = "Verifies Google ID token, registers or logs in user, and returns session token")
    public ResponseEntity<AuthResponse> authenticateWithGoogle(@Valid @RequestBody GoogleAuthRequest request) {
        AuthResponse response = authService.authenticateWithGoogle(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    @Operation(summary = "Get current authenticated user profile")
    public ResponseEntity<UserDTO> getCurrentUser(
            @Parameter(description = "Bearer session token", required = true)
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        UserDTO user = authService.getCurrentUser(authHeader);
        return ResponseEntity.ok(user);
    }

    @PostMapping("/logout")
    @Operation(summary = "Logout user and invalidate session token")
    public ResponseEntity<Void> logout(
            @Parameter(description = "Bearer session token")
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        authService.logout(authHeader);
        return ResponseEntity.ok().build();
    }
}
