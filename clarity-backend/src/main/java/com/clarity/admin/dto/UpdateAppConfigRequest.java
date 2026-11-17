package com.clarity.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateAppConfigRequest {

    @NotBlank(message = "Minimum version is required")
    private String minVersion;

    @NotBlank(message = "Latest version is required")
    private String latestVersion;

    private boolean maintenanceMode;
}
