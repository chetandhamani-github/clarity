package com.clarity.admin;

import com.clarity.admin.controller.AdminController;
import com.clarity.admin.dto.AdminStatsResponse;
import com.clarity.admin.service.AdminService;
import com.clarity.exception.ApiException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AdminController.class)
class AdminControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AdminService adminService;

    @Test
    @DisplayName("GET /api/v1/admin/stats with valid key returns 200 and stats")
    void shouldReturnStatsWithValidKey() throws Exception {
        AdminStatsResponse response = AdminStatsResponse.builder()
                .totalDevices(42)
                .activeDevicesLast7Days(15)
                .maintenanceMode(false)
                .minAppVersion("1.0.0")
                .latestAppVersion("1.0.0")
                .activeAnnouncements(1)
                .totalFeatureFlags(5)
                .databaseStatus("Connected")
                .build();

        doNothing().when(adminService).validateAdminKey("test-key");
        when(adminService.getStats()).thenReturn(response);

        mockMvc.perform(get("/api/v1/admin/stats").header("X-Admin-Key", "test-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalDevices").value(42))
                .andExpect(jsonPath("$.totalFeatureFlags").value(5))
                .andExpect(jsonPath("$.databaseStatus").value("Connected"));
    }

    @Test
    @DisplayName("GET /api/v1/admin/stats without key returns 401 Unauthorized")
    void shouldReturnUnauthorizedWithoutKey() throws Exception {
        doThrow(new ApiException("Invalid or missing X-Admin-Key header", HttpStatus.UNAUTHORIZED))
                .when(adminService).validateAdminKey(null);

        mockMvc.perform(get("/api/v1/admin/stats"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }
}
