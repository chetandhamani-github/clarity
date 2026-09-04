package com.clarity.health.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Health status response")
public class HealthResponse {

    @Schema(description = "Service health status", example = "UP")
    private String status;

    @Schema(description = "Service identifier", example = "clarity-backend")
    private String service;
}
