package com.clarity.device.controller;

import com.clarity.common.dto.ErrorResponse;
import com.clarity.device.dto.DeviceRegistrationRequest;
import com.clarity.device.dto.DeviceRegistrationResponse;
import com.clarity.device.dto.DeviceStatusResponse;
import com.clarity.device.service.DeviceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
@Tag(name = "Device", description = "Device registration, telemetry, and status endpoints")
public class DeviceController {

    private final DeviceService deviceService;

    @PostMapping("/register")
    @Operation(summary = "Register or ping device", description = "Registers a new device installation or updates version/last seen timestamp for existing device")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Device registered/updated successfully",
                    content = @Content(schema = @Schema(implementation = DeviceRegistrationResponse.class))),
            @ApiResponse(responseCode = "400", description = "Validation failed",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    public ResponseEntity<DeviceRegistrationResponse> registerDevice(
            @Valid @RequestBody DeviceRegistrationRequest request) {
        DeviceRegistrationResponse response = deviceService.registerDevice(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{installationId}/status")
    @Operation(summary = "Get device status", description = "Retrieves the current status (ACTIVE, BLOCKED, SUSPENDED) for a device installation")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Device status retrieved successfully",
                    content = @Content(schema = @Schema(implementation = DeviceStatusResponse.class))),
            @ApiResponse(responseCode = "404", description = "Device not found with provided installation ID",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    public ResponseEntity<DeviceStatusResponse> getDeviceStatus(
            @Parameter(description = "Device unique installation ID", required = true, example = "d9f8c12a-89a1-432a-bc91-239104812f81")
            @PathVariable String installationId) {
        DeviceStatusResponse response = deviceService.getDeviceStatus(installationId);
        return ResponseEntity.ok(response);
    }
}
