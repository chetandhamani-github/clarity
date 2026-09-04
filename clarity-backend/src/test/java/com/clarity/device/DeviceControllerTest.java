package com.clarity.device;

import com.clarity.device.controller.DeviceController;
import com.clarity.device.dto.DeviceRegistrationRequest;
import com.clarity.device.dto.DeviceRegistrationResponse;
import com.clarity.device.dto.DeviceStatusResponse;
import com.clarity.device.entity.DeviceStatus;
import com.clarity.device.service.DeviceService;
import com.clarity.exception.ResourceNotFoundException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DeviceController.class)
class DeviceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private DeviceService deviceService;

    @Test
    @DisplayName("POST /api/v1/devices/register should return 200 with success and deviceId")
    void shouldRegisterDeviceSuccessfully() throws Exception {
        UUID deviceId = UUID.randomUUID();
        DeviceRegistrationRequest request = DeviceRegistrationRequest.builder()
                .installationId("inst-12345")
                .platform("android")
                .appVersion("1.0.0")
                .deviceName("Samsung S24")
                .build();

        DeviceRegistrationResponse response = DeviceRegistrationResponse.builder()
                .success(true)
                .deviceId(deviceId)
                .build();

        when(deviceService.registerDevice(any(DeviceRegistrationRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/devices/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.deviceId").value(deviceId.toString()));
    }

    @Test
    @DisplayName("POST /api/v1/devices/register should return 400 when installationId is blank")
    void shouldReturnBadRequestWhenInstallationIdIsBlank() throws Exception {
        DeviceRegistrationRequest invalidRequest = DeviceRegistrationRequest.builder()
                .installationId("")
                .platform("android")
                .build();

        mockMvc.perform(post("/api/v1/devices/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors.installationId").exists());
    }

    @Test
    @DisplayName("GET /api/v1/devices/{installationId}/status should return 200 with status ACTIVE")
    void shouldReturnDeviceStatus() throws Exception {
        DeviceStatusResponse response = DeviceStatusResponse.builder()
                .status(DeviceStatus.ACTIVE)
                .build();

        when(deviceService.getDeviceStatus("inst-12345")).thenReturn(response);

        mockMvc.perform(get("/api/v1/devices/inst-12345/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    @DisplayName("GET /api/v1/devices/{installationId}/status should return 404 when device not found")
    void shouldReturn404WhenDeviceNotFound() throws Exception {
        when(deviceService.getDeviceStatus("unknown-inst"))
                .thenThrow(new ResourceNotFoundException("Device", "installationId", "unknown-inst"));

        mockMvc.perform(get("/api/v1/devices/unknown-inst/status"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }
}
