package com.clarity.common.security;

import com.clarity.auth.repository.UserRepository;
import com.clarity.device.entity.Device;
import com.clarity.device.entity.DeviceStatus;
import com.clarity.device.repository.DeviceRepository;
import com.clarity.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ApiProtectionInterceptorTest {

    private DeviceRepository deviceRepository;
    private UserRepository userRepository;
    private ApiProtectionInterceptor interceptor;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        deviceRepository = mock(DeviceRepository.class);
        userRepository = mock(UserRepository.class);

        ObjectProvider<DeviceRepository> deviceProvider = mock(ObjectProvider.class);
        when(deviceProvider.getIfAvailable()).thenReturn(deviceRepository);

        ObjectProvider<UserRepository> userProvider = mock(ObjectProvider.class);
        when(userProvider.getIfAvailable()).thenReturn(userRepository);

        interceptor = new ApiProtectionInterceptor(deviceProvider, userProvider, true);
    }

    @Test
    @DisplayName("AI endpoint rejects unauthenticated request without X-Installation-Id")
    void shouldRejectMissingCredentialsForAi() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
        MockHttpServletResponse res = new MockHttpServletResponse();

        assertThatThrownBy(() -> interceptor.preHandle(req, res, new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getStatus())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("AI endpoint rejects blocked device")
    void shouldRejectBlockedDevice() {
        Device blocked = Device.builder()
                .installationId("blocked-install-123")
                .status(DeviceStatus.BLOCKED)
                .build();
        when(deviceRepository.findByInstallationId("blocked-install-123")).thenReturn(Optional.of(blocked));

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/categorize");
        req.addHeader("X-Installation-Id", "blocked-install-123");
        MockHttpServletResponse res = new MockHttpServletResponse();

        assertThatThrownBy(() -> interceptor.preHandle(req, res, new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getStatus())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("AI endpoint enforces per-client rate limit with 429")
    void shouldRateLimitExcessiveAiCalls() {
        when(deviceRepository.findByInstallationId("valid-install-123")).thenReturn(Optional.empty());

        for (int i = 0; i < 30; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
            req.addHeader("X-Installation-Id", "valid-install-123");
            assertThat(interceptor.preHandle(req, new MockHttpServletResponse(), new Object())).isTrue();
        }

        MockHttpServletRequest overLimitReq = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
        overLimitReq.addHeader("X-Installation-Id", "valid-install-123");
        MockHttpServletResponse overLimitRes = new MockHttpServletResponse();

        assertThatThrownBy(() -> interceptor.preHandle(overLimitReq, overLimitRes, new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getStatus())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }
}

