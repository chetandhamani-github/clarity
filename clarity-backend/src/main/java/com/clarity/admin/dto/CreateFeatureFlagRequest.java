package com.clarity.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateFeatureFlagRequest {

    @NotBlank(message = "Feature flag key is required")
    @Pattern(regexp = "^[a-z0-9_]+$", message = "Key must only contain lowercase letters, numbers, and underscores")
    private String key;

    private boolean enabled;

    private String description;
}
