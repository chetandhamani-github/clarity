package com.clarity.auth.service;

import com.clarity.auth.dto.AuthResponse;
import com.clarity.auth.dto.GoogleAuthRequest;
import com.clarity.auth.dto.UserDTO;

public interface AuthService {
    AuthResponse authenticateWithGoogle(GoogleAuthRequest request);
    UserDTO getCurrentUser(String authHeader);
    void logout(String authHeader);
}
