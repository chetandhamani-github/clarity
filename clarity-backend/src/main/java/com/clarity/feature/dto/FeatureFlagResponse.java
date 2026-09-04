package com.clarity.feature.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Feature flag configuration item")
public class FeatureFlagResponse {

    @Schema(description = "Unique feature flag key", example = "splitwise")
    private String key;

    @Schema(description = "Flag activation state", example = "false")
    private boolean enabled;
}
