package com.clarity.config;

import com.clarity.config.controller.AppConfigController;
import com.clarity.config.dto.AppConfigResponse;
import com.clarity.config.service.AppConfigService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AppConfigController.class)
class AppConfigControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AppConfigService appConfigService;

    @Test
    @DisplayName("GET /api/v1/config should return 200 with minVersion, latestVersion, maintenanceMode")
    void shouldReturnAppConfig() throws Exception {
        AppConfigResponse configResponse = AppConfigResponse.builder()
                .minVersion("1.0.0")
                .latestVersion("1.2.0")
                .maintenanceMode(false)
                .build();

        when(appConfigService.getAppConfig()).thenReturn(configResponse);

        mockMvc.perform(get("/api/v1/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.minVersion").value("1.0.0"))
                .andExpect(jsonPath("$.latestVersion").value("1.2.0"))
                .andExpect(jsonPath("$.maintenanceMode").value(false));
    }
}
