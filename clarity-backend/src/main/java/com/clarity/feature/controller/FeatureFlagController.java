package com.clarity.feature.controller;

import com.clarity.feature.dto.FeatureFlagResponse;
import com.clarity.feature.service.FeatureFlagService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/features")
@RequiredArgsConstructor
@Tag(name = "Features", description = "Dynamic feature flag gating endpoints")
public class FeatureFlagController {

    private final FeatureFlagService featureFlagService;

    @GetMapping
    @Operation(summary = "Get all feature flags", description = "Retrieves dynamic feature flags for enabling/disabling app features remotely")
    @ApiResponse(responseCode = "200", description = "Feature flags retrieved successfully",
            content = @Content(array = @ArraySchema(schema = @Schema(implementation = FeatureFlagResponse.class))))
    public ResponseEntity<List<FeatureFlagResponse>> getFeatureFlags() {
        List<FeatureFlagResponse> flags = featureFlagService.getAllFeatureFlags();
        return ResponseEntity.ok(flags);
    }
}
