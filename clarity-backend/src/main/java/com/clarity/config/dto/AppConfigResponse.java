package com.clarity.config.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Global application configuration details")
public class AppConfigResponse {

    @Schema(description = "Minimum required app version before forced update is prompted", example = "1.0.0")
    private String minVersion;

    @Schema(description = "Latest available app version", example = "1.2.0")
    private String latestVersion;

    @Schema(description = "Whether the application is currently under maintenance", example = "false")
    private boolean maintenanceMode;
}
