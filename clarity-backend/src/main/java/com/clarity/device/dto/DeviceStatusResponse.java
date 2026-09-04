package com.clarity.device.dto;

import com.clarity.device.entity.DeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Device status response")
public class DeviceStatusResponse {

    @Schema(description = "Current lifecycle status of device", example = "ACTIVE")
    private DeviceStatus status;
}
