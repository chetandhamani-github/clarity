package com.clarity.config.controller;

import com.clarity.config.dto.AppConfigResponse;
import com.clarity.config.service.AppConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/config")
@RequiredArgsConstructor
@Tag(name = "Configuration", description = "Application versioning and global configuration endpoints")
public class AppConfigController {

    private final AppConfigService appConfigService;

    @GetMapping
    @Operation(summary = "Get application configuration", description = "Returns the minimum supported version, latest release version, and maintenance mode status")
    @ApiResponse(responseCode = "200", description = "App configuration retrieved successfully",
            content = @Content(schema = @Schema(implementation = AppConfigResponse.class)))
    public ResponseEntity<AppConfigResponse> getAppConfig() {
        AppConfigResponse config = appConfigService.getAppConfig();
        return ResponseEntity.ok(config);
    }
}
