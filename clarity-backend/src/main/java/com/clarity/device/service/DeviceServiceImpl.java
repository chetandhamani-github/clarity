package com.clarity.device.service;

import com.clarity.device.dto.DeviceRegistrationRequest;
import com.clarity.device.dto.DeviceRegistrationResponse;
import com.clarity.device.dto.DeviceStatusResponse;
import com.clarity.device.entity.Device;
import com.clarity.device.entity.DeviceStatus;
import com.clarity.device.repository.DeviceRepository;
import com.clarity.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceServiceImpl implements DeviceService {

    private final DeviceRepository deviceRepository;

    @Override
    @Transactional
    public DeviceRegistrationResponse registerDevice(DeviceRegistrationRequest request) {
        log.info("Processing device registration for installationId: {}", request.getInstallationId());

        Optional<Device> existingDeviceOpt = deviceRepository.findByInstallationId(request.getInstallationId());

        Device device;
        if (existingDeviceOpt.isPresent()) {
            device = existingDeviceOpt.get();
            device.setLastSeen(Instant.now());
            if (request.getAppVersion() != null) {
                device.setAppVersion(request.getAppVersion());
            }
            if (request.getPlatform() != null) {
                device.setPlatform(request.getPlatform());
            }
            if (request.getDeviceName() != null) {
                device.setDeviceName(request.getDeviceName());
            }
            log.info("Updated existing device: {} (ID: {})", device.getInstallationId(), device.getId());
        } else {
            device = Device.builder()
                    .installationId(request.getInstallationId())
                    .platform(request.getPlatform())
                    .appVersion(request.getAppVersion())
                    .deviceName(request.getDeviceName())
                    .status(DeviceStatus.ACTIVE)
                    .lastSeen(Instant.now())
                    .build();
            log.info("Creating new device registration for installationId: {}", device.getInstallationId());
        }

        Device savedDevice = deviceRepository.save(device);

        return DeviceRegistrationResponse.builder()
                .success(true)
                .deviceId(savedDevice.getId())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public DeviceStatusResponse getDeviceStatus(String installationId) {
        log.debug("Fetching device status for installationId: {}", installationId);
        Device device = deviceRepository.findByInstallationId(installationId)
                .orElseThrow(() -> new ResourceNotFoundException("Device", "installationId", installationId));

        return DeviceStatusResponse.builder()
                .status(device.getStatus())
                .build();
    }
}
