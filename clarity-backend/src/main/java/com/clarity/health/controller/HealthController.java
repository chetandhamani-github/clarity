package com.clarity.health.controller;

import com.clarity.health.dto.HealthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/health")
@Tag(name = "Health", description = "Application health check endpoints")
public class HealthController {

    private static final String SERVICE_NAME = "clarity-backend";
    private static final String STATUS_UP = "UP";

    @GetMapping
    @Operation(summary = "Check backend service health", description = "Returns the operational status of the Clarity backend service")
    @ApiResponse(responseCode = "200", description = "Service is up and operational")
    public ResponseEntity<HealthResponse> checkHealth() {
        return ResponseEntity.ok(
                HealthResponse.builder()
                        .status(STATUS_UP)
                        .service(SERVICE_NAME)
                        .build()
        );
    }
}
