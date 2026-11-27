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

    @Test
    @DisplayName("AI endpoint rejects invalid Bearer token even when X-Installation-Id is present")
    void shouldRejectInvalidBearerToken() {
        when(userRepository.findByAuthToken("bad-token")).thenReturn(Optional.empty());

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
        req.addHeader("X-Installation-Id", "valid-install-123");
        req.addHeader("Authorization", "Bearer bad-token");
        MockHttpServletResponse res = new MockHttpServletResponse();

        assertThatThrownBy(() -> interceptor.preHandle(req, res, new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getStatus())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("AI endpoint enforces per-IP ceiling across rotated X-Installation-Id headers")
    void shouldRateLimitAiByIpAcrossRotatedInstallationIds() {
        when(deviceRepository.findByInstallationId(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(Optional.empty());

        for (int i = 0; i < 45; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
            req.setRemoteAddr("198.51.100.42");
            req.addHeader("X-Installation-Id", "rotated-install-" + i);
            assertThat(interceptor.preHandle(req, new MockHttpServletResponse(), new Object())).isTrue();
        }

        MockHttpServletRequest blockedReq = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
        blockedReq.setRemoteAddr("198.51.100.42");
        blockedReq.addHeader("X-Installation-Id", "rotated-install-999");

        assertThatThrownBy(() -> interceptor.preHandle(blockedReq, new MockHttpServletResponse(), new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getStatus())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    @DisplayName("AI endpoint ignores spoofed X-Forwarded-For from direct untrusted client IP")
    void shouldIgnoreSpoofedForwardedForFromPublicRemoteAddr() {
        when(deviceRepository.findByInstallationId(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(Optional.empty());

        for (int i = 0; i < 45; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
            req.setRemoteAddr("203.0.113.77");
            req.addHeader("X-Forwarded-For", "198.51.100." + i);
            req.addHeader("X-Installation-Id", "spoof-install-" + i);
            assertThat(interceptor.preHandle(req, new MockHttpServletResponse(), new Object())).isTrue();
        }

        MockHttpServletRequest blockedReq = new MockHttpServletRequest("POST", "/api/v1/ai/chat");
        blockedReq.setRemoteAddr("203.0.113.77");
        blockedReq.addHeader("X-Forwarded-For", "198.51.100.250");
        blockedReq.addHeader("X-Installation-Id", "spoof-install-final");

        assertThatThrownBy(() -> interceptor.preHandle(blockedReq, new MockHttpServletResponse(), new Object()))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getStatus())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }
}

