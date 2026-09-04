package com.clarity.feature;

import com.clarity.feature.controller.FeatureFlagController;
import com.clarity.feature.dto.FeatureFlagResponse;
import com.clarity.feature.service.FeatureFlagService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FeatureFlagController.class)
class FeatureFlagControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FeatureFlagService featureFlagService;

    @Test
    @DisplayName("GET /api/v1/features should return 200 with list of feature flags")
    void shouldReturnFeatureFlagsList() throws Exception {
        List<FeatureFlagResponse> flags = List.of(
                FeatureFlagResponse.builder().key("subscription_manager").enabled(true).build(),
                FeatureFlagResponse.builder().key("splitwise").enabled(false).build(),
                FeatureFlagResponse.builder().key("premium").enabled(false).build()
        );

        when(featureFlagService.getAllFeatureFlags()).thenReturn(flags);

        mockMvc.perform(get("/api/v1/features"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].key").value("subscription_manager"))
                .andExpect(jsonPath("$[0].enabled").value(true))
                .andExpect(jsonPath("$[1].key").value("splitwise"))
                .andExpect(jsonPath("$[1].enabled").value(false));
    }
}
