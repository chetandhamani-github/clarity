package com.clarity.auth.service;

import com.clarity.auth.dto.AuthResponse;
import com.clarity.auth.dto.GoogleAuthRequest;
import com.clarity.auth.dto.UserDTO;
import com.clarity.auth.entity.User;
import com.clarity.auth.repository.UserRepository;
import com.clarity.exception.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final RestTemplate restTemplate;
    private final boolean allowUnverifiedFallback;
    private final Set<String> allowedGoogleClientIds;

    @Autowired
    public AuthServiceImpl(
            UserRepository userRepository,
            @Value("${clarity.auth.allow-unverified-fallback:false}") boolean allowUnverifiedFallback,
            @Value("${clarity.auth.google-client-id:}") String googleClientIds) {
        this(userRepository, new RestTemplate(), allowUnverifiedFallback, googleClientIds);
    }

    public AuthServiceImpl(
            UserRepository userRepository,
            RestTemplate restTemplate,
            boolean allowUnverifiedFallback,
            String googleClientIds) {
        this.userRepository = userRepository;
        this.restTemplate = restTemplate;
        this.allowUnverifiedFallback = allowUnverifiedFallback;
        this.allowedGoogleClientIds = googleClientIds == null
                ? Set.of()
                : Arrays.stream(googleClientIds.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toSet());
    }

    @Override
    @Transactional
    public AuthResponse authenticateWithGoogle(GoogleAuthRequest request) {
        String email = null;
        String name = null;
        String avatarUrl = null;
        String googleId = null;

        // 1. Verify Google ID token via Google TokenInfo API
        if (request.getIdToken() != null && !request.getIdToken().trim().isEmpty()) {
            try {
                String encodedToken = URLEncoder.encode(request.getIdToken().trim(), StandardCharsets.UTF_8);
                String tokenInfoUrl = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodedToken;
                @SuppressWarnings("unchecked")
                Map<String, Object> tokenInfo = restTemplate.getForObject(tokenInfoUrl, Map.class);
                if (tokenInfo != null && tokenInfo.containsKey("email")) {
                    Object emailVerified = tokenInfo.get("email_verified");
                    if ("false".equalsIgnoreCase(String.valueOf(emailVerified))) {
                        throw new ApiException("Google account email is not verified", HttpStatus.UNAUTHORIZED);
                    }
                    if (!allowedGoogleClientIds.isEmpty()) {
                        String aud = tokenInfo.get("aud") != null ? String.valueOf(tokenInfo.get("aud")).trim() : "";
                        String azp = tokenInfo.get("azp") != null ? String.valueOf(tokenInfo.get("azp")).trim() : "";
                        if (!allowedGoogleClientIds.contains(aud) && !allowedGoogleClientIds.contains(azp)) {
                            throw new ApiException("Google token audience mismatch", HttpStatus.UNAUTHORIZED);
                        }
                    }
                    email = (String) tokenInfo.get("email");
                    name = (String) tokenInfo.get("name");
                    avatarUrl = (String) tokenInfo.get("picture");
                    googleId = (String) tokenInfo.get("sub");
                }
            } catch (ApiException e) {
                throw e;
            } catch (Exception e) {
                log.warn("Google tokeninfo verification failed: {}", e.getMessage());
            }
        }

        // Only allow unverified profile fallback in explicitly configured local/dev environments
        if (email == null && allowUnverifiedFallback && request.getEmail() != null && !request.getEmail().trim().isEmpty()) {
            email = request.getEmail().trim().toLowerCase();
            name = request.getName();
            avatarUrl = request.getAvatarUrl();
        }

        if (email == null || email.trim().isEmpty()) {
            throw new ApiException("Invalid or unverified Google authentication token", HttpStatus.UNAUTHORIZED);
        }

        email = email.trim().toLowerCase();
        if (name == null || name.trim().isEmpty()) {
            name = email.split("@")[0];
        }

        // 2. Find or create user
        Optional<User> existingUser = userRepository.findByEmail(email);
        User user;
        Instant now = Instant.now();
        String sessionToken = "clr_" + UUID.randomUUID().toString().replace("-", "");

        if (existingUser.isPresent()) {
            user = existingUser.get();
            user.setName(name);
            if (avatarUrl != null) {
                user.setAvatarUrl(avatarUrl);
            }
            if (googleId != null) {
                user.setGoogleId(googleId);
            }
            user.setAuthToken(sessionToken);
            user.setLastLoginAt(now);
        } else {
            user = User.builder()
                    .email(email)
                    .name(name)
                    .avatarUrl(avatarUrl)
                    .googleId(googleId)
                    .authToken(sessionToken)
                    .status("ACTIVE")
                    .lastLoginAt(now)
                    .build();
        }

        user = userRepository.save(user);

        log.info("User authenticated via Google: id={}, email={}", user.getId(), user.getEmail());

        return AuthResponse.builder()
                .token(sessionToken)
                .user(mapToDTO(user))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public UserDTO getCurrentUser(String authHeader) {
        String token = extractToken(authHeader);
        User user = userRepository.findByAuthToken(token)
                .orElseThrow(() -> new ApiException("Invalid or expired session token", HttpStatus.UNAUTHORIZED));
        return mapToDTO(user);
    }

    @Override
    @Transactional
    public void logout(String authHeader) {
        try {
            String token = extractToken(authHeader);
            userRepository.findByAuthToken(token).ifPresent(user -> {
                user.setAuthToken(null);
                userRepository.save(user);
            });
        } catch (Exception e) {
            log.debug("Logout called with invalid or empty token: {}", e.getMessage());
        }
    }

    private String extractToken(String authHeader) {
        if (authHeader == null || authHeader.trim().isEmpty()) {
            throw new ApiException("Authorization token is required", HttpStatus.UNAUTHORIZED);
        }
        String trimmed = authHeader.trim();
        if (trimmed.startsWith("Bearer ")) {
            return trimmed.substring(7).trim();
        }
        return trimmed;
    }

    private UserDTO mapToDTO(User user) {
        return UserDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .avatarUrl(user.getAvatarUrl())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
