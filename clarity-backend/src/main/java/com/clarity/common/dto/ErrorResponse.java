package com.clarity.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "Standard error response representation")
public class ErrorResponse {

    @Schema(description = "HTTP status code", example = "400")
    private int status;

    @Schema(description = "Error name or summary", example = "Bad Request")
    private String error;

    @Schema(description = "Detailed human-readable error message", example = "Invalid input parameter")
    private String message;

    @Schema(description = "API path where error occurred", example = "/api/v1/devices/register")
    private String path;

    @Schema(description = "Map of field errors for validation failures")
    private Map<String, String> errors;

    @Builder.Default
    @Schema(description = "Timestamp when error occurred", example = "2026-09-01T12:00:00Z")
    private Instant timestamp = Instant.now();
}
