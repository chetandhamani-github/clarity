package com.clarity.admin.dto;

import com.clarity.device.entity.DeviceStatus;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateDeviceStatusRequest {

    @NotNull(message = "Status is required")
    private DeviceStatus status;
}
