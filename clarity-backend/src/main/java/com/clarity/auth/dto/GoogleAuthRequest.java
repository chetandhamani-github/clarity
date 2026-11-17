package com.clarity.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoogleAuthRequest {

    @NotBlank(message = "idToken is required")
    @Schema(description = "Google ID token obtained from native Google Sign-In")
    private String idToken;

    @Schema(description = "User email (optional fallback)")
    private String email;

    @Schema(description = "User display name (optional fallback)")
    private String name;

    @Schema(description = "User profile photo URL (optional fallback)")
    private String avatarUrl;
}
