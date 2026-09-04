package com.clarity.device.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Device registration response")
public class DeviceRegistrationResponse {

    @Schema(description = "Indicates whether registration or update was successful", example = "true")
    private boolean success;

    @Schema(description = "Internal unique UUID identifier of registered device", example = "3fa85f64-5717-4562-b3fc-2c963f66afa6")
    private UUID deviceId;
}
