package com.clarity.device;

import com.clarity.device.dto.DeviceRegistrationRequest;
import com.clarity.device.dto.DeviceRegistrationResponse;
import com.clarity.device.dto.DeviceStatusResponse;
import com.clarity.device.entity.Device;
import com.clarity.device.entity.DeviceStatus;
import com.clarity.device.repository.DeviceRepository;
import com.clarity.device.service.DeviceServiceImpl;
import com.clarity.exception.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeviceServiceTest {

    @Mock
    private DeviceRepository deviceRepository;

    @InjectMocks
    private DeviceServiceImpl deviceService;

    private Device existingDevice;
    private UUID deviceId;

    @BeforeEach
    void setUp() {
        deviceId = UUID.randomUUID();
        existingDevice = Device.builder()
                .id(deviceId)
                .installationId("inst-12345")
                .platform("android")
                .appVersion("1.0.0")
                .deviceName("Pixel 8")
                .status(DeviceStatus.ACTIVE)
                .createdAt(Instant.now().minusSeconds(3600))
                .updatedAt(Instant.now().minusSeconds(3600))
                .lastSeen(Instant.now().minusSeconds(3600))
                .build();
    }

    @Test
    @DisplayName("registerDevice creates new device when installationId does not exist")
    void shouldRegisterNewDevice() {
        DeviceRegistrationRequest request = DeviceRegistrationRequest.builder()
                .installationId("inst-new-999")
                .platform("ios")
                .appVersion("1.1.0")
                .deviceName("iPhone 15 Pro")
                .build();

        UUID newId = UUID.randomUUID();
        when(deviceRepository.findByInstallationId("inst-new-999")).thenReturn(Optional.empty());
        when(deviceRepository.save(any(Device.class))).thenAnswer(invocation -> {
            Device d = invocation.getArgument(0);
            d.setId(newId);
            return d;
        });

        DeviceRegistrationResponse response = deviceService.registerDevice(request);

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals(newId, response.getDeviceId());

        ArgumentCaptor<Device> captor = ArgumentCaptor.forClass(Device.class);
        verify(deviceRepository).save(captor.capture());
        Device saved = captor.getValue();
        assertEquals("inst-new-999", saved.getInstallationId());
        assertEquals("ios", saved.getPlatform());
        assertEquals("1.1.0", saved.getAppVersion());
        assertEquals(DeviceStatus.ACTIVE, saved.getStatus());
        assertNotNull(saved.getLastSeen());
    }

    @Test
    @DisplayName("registerDevice updates existing device when installationId exists")
    void shouldUpdateExistingDevice() {
        DeviceRegistrationRequest request = DeviceRegistrationRequest.builder()
                .installationId("inst-12345")
                .platform("android")
                .appVersion("1.2.0")
                .deviceName("Pixel 8 Pro")
                .build();

        when(deviceRepository.findByInstallationId("inst-12345")).thenReturn(Optional.of(existingDevice));
        when(deviceRepository.save(any(Device.class))).thenReturn(existingDevice);

        DeviceRegistrationResponse response = deviceService.registerDevice(request);

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals(deviceId, response.getDeviceId());

        ArgumentCaptor<Device> captor = ArgumentCaptor.forClass(Device.class);
        verify(deviceRepository).save(captor.capture());
        Device saved = captor.getValue();
        assertEquals("1.2.0", saved.getAppVersion());
        assertEquals("Pixel 8 Pro", saved.getDeviceName());
    }

    @Test
    @DisplayName("getDeviceStatus returns status when device exists")
    void shouldReturnDeviceStatusWhenFound() {
        when(deviceRepository.findByInstallationId("inst-12345")).thenReturn(Optional.of(existingDevice));

        DeviceStatusResponse response = deviceService.getDeviceStatus("inst-12345");

        assertNotNull(response);
        assertEquals(DeviceStatus.ACTIVE, response.getStatus());
    }

    @Test
    @DisplayName("getDeviceStatus throws ResourceNotFoundException when device does not exist")
    void shouldThrowNotFoundWhenDeviceMissing() {
        when(deviceRepository.findByInstallationId("inst-missing")).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> deviceService.getDeviceStatus("inst-missing"));
    }
}
