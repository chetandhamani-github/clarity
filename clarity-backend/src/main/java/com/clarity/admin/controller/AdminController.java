package com.clarity.admin.controller;

import com.clarity.admin.dto.*;
import com.clarity.admin.service.AdminService;
import com.clarity.announcement.entity.Announcement;
import com.clarity.config.entity.AppConfig;
import com.clarity.device.entity.Device;
import com.clarity.feature.entity.FeatureFlag;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@Tag(name = "Admin", description = "Clarity administration and remote control management endpoints")
public class AdminController {

    private final AdminService adminService;

    @GetMapping("/stats")
    @Operation(summary = "Get system dashboard statistics")
    public ResponseEntity<AdminStatsResponse> getStats(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.getStats());
    }

    @GetMapping("/config")
    @Operation(summary = "Get app configuration")
    public ResponseEntity<AppConfig> getAppConfig(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.getAppConfig());
    }

    @PutMapping("/config")
    @Operation(summary = "Update app configuration (versions & maintenance mode)")
    public ResponseEntity<AppConfig> updateAppConfig(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @Valid @RequestBody UpdateAppConfigRequest request) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.updateAppConfig(request));
    }

    @GetMapping("/features")
    @Operation(summary = "Get all feature flags")
    public ResponseEntity<List<FeatureFlag>> getFeatureFlags(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.getAllFeatureFlags());
    }

    @PostMapping("/features")
    @Operation(summary = "Create a new feature flag")
    public ResponseEntity<FeatureFlag> createFeatureFlag(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @Valid @RequestBody CreateFeatureFlagRequest request) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.createFeatureFlag(request));
    }

    @PutMapping("/features/{key}")
    @Operation(summary = "Update a feature flag (enabled state and description)")
    public ResponseEntity<FeatureFlag> updateFeatureFlag(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @PathVariable String key,
            @Valid @RequestBody UpdateFeatureFlagRequest request) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.updateFeatureFlag(key, request));
    }

    @DeleteMapping("/features/{key}")
    @Operation(summary = "Delete a feature flag")
    public ResponseEntity<Map<String, String>> deleteFeatureFlag(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @PathVariable String key) {
        adminService.validateAdminKey(adminKey);
        adminService.deleteFeatureFlag(key);
        return ResponseEntity.ok(Map.of("message", "Feature flag deleted successfully", "key", key));
    }

    @GetMapping("/announcements")
    @Operation(summary = "Get all announcements (active and inactive)")
    public ResponseEntity<List<Announcement>> getAnnouncements(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.getAllAnnouncements());
    }

    @PostMapping("/announcements")
    @Operation(summary = "Create an in-app broadcast announcement")
    public ResponseEntity<Announcement> createAnnouncement(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @Valid @RequestBody CreateAnnouncementRequest request) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.createAnnouncement(request));
    }

    @PutMapping("/announcements/{id}/toggle")
    @Operation(summary = "Toggle an announcement active/inactive")
    public ResponseEntity<Announcement> toggleAnnouncement(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @PathVariable UUID id) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.toggleAnnouncement(id));
    }

    @DeleteMapping("/announcements/{id}")
    @Operation(summary = "Delete an announcement")
    public ResponseEntity<Map<String, String>> deleteAnnouncement(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @PathVariable UUID id) {
        adminService.validateAdminKey(adminKey);
        adminService.deleteAnnouncement(id);
        return ResponseEntity.ok(Map.of("message", "Announcement deleted successfully"));
    }

    @GetMapping("/devices")
    @Operation(summary = "Get paginated list of registered devices")
    public ResponseEntity<Page<Device>> getDevices(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @Parameter(description = "Page number (0-indexed)") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "50") int size) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.getDevices(page, size));
    }

    @PutMapping("/devices/{installationId}/status")
    @Operation(summary = "Update device status (ACTIVE, BLOCKED, SUSPENDED)")
    public ResponseEntity<Device> updateDeviceStatus(
            @RequestHeader(value = "X-Admin-Key", required = false) String adminKey,
            @PathVariable String installationId,
            @Valid @RequestBody UpdateDeviceStatusRequest request) {
        adminService.validateAdminKey(adminKey);
        return ResponseEntity.ok(adminService.updateDeviceStatus(installationId, request));
    }
}
