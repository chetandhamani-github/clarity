package com.clarity.device.service;

import com.clarity.device.dto.DeviceRegistrationRequest;
import com.clarity.device.dto.DeviceRegistrationResponse;
import com.clarity.device.dto.DeviceStatusResponse;

public interface DeviceService {

    DeviceRegistrationResponse registerDevice(DeviceRegistrationRequest request);

    DeviceStatusResponse getDeviceStatus(String installationId);
}
