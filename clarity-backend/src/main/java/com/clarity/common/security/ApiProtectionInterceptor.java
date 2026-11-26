package com.clarity.common.security;

import com.clarity.auth.repository.UserRepository;
import com.clarity.device.entity.Device;
import com.clarity.device.entity.DeviceStatus;
import com.clarity.device.repository.DeviceRepository;
import com.clarity.exception.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class ApiProtectionInterceptor implements HandlerInterceptor {

    private static final long WINDOW_MS = 60_000L;
    private static final int AI_LIMIT_PER_MIN = 30;
    private static final int AUTH_LIMIT_PER_MIN = 20;
    private static final int SPLITWISE_LIMIT_PER_MIN = 60;
    private static final int MAX_BUCKET_ENTRIES = 10_000;

    private final ObjectProvider<DeviceRepository> deviceRepositoryProvider;
    private final ObjectProvider<UserRepository> userRepositoryProvider;
    private final boolean requireClientIdentity;
    private final Map<String, RateBucket> buckets = new ConcurrentHashMap<>();

    public ApiProtectionInterceptor(
            ObjectProvider<DeviceRepository> deviceRepositoryProvider,
            ObjectProvider<UserRepository> userRepositoryProvider,
            @Value("${clarity.security.require-client-identity:true}") boolean requireClientIdentity) {
        this.deviceRepositoryProvider = deviceRepositoryProvider;
        this.userRepositoryProvider = userRepositoryProvider;
        this.requireClientIdentity = requireClientIdentity;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String path = request.getRequestURI();
        String installationId = trimToNull(request.getHeader("X-Installation-Id"));
        String authHeader = trimToNull(request.getHeader("Authorization"));

        if (requireClientIdentity && (path.startsWith("/api/v1/ai") || path.startsWith("/api/v1/splitwise"))) {
            boolean hasValidInstall = installationId != null && installationId.length() >= 6;
            boolean hasValidAuth = hasValidBearerToken(authHeader);

            if (!hasValidInstall && !hasValidAuth) {
                throw new ApiException("Missing or invalid client credentials", HttpStatus.UNAUTHORIZED);
            }

            if (hasValidInstall) {
                DeviceRepository deviceRepository = deviceRepositoryProvider.getIfAvailable();
                if (deviceRepository != null) {
                    Optional<Device> deviceOpt = deviceRepository.findByInstallationId(installationId);
                    if (deviceOpt.isPresent() && deviceOpt.get().getStatus() == DeviceStatus.BLOCKED) {
                        throw new ApiException("Device access has been suspended", HttpStatus.FORBIDDEN);
                    }
                }
            }
        }

        String group;
        int limit;
        if (path.startsWith("/api/v1/ai")) {
            group = "ai";
            limit = AI_LIMIT_PER_MIN;
        } else if (path.startsWith("/api/v1/auth")) {
            group = "auth";
            limit = AUTH_LIMIT_PER_MIN;
        } else if (path.startsWith("/api/v1/splitwise")) {
            group = "splitwise";
            limit = SPLITWISE_LIMIT_PER_MIN;
        } else {
            return true;
        }

        String clientKey = installationId != null
                ? "inst:" + installationId
                : (authHeader != null ? "auth:" + authHeader.hashCode() : "ip:" + resolveClientIp(request));

        if (!allowRequest(group + ":" + clientKey, limit)) {
            response.setHeader("Retry-After", "60");
            throw new ApiException("Too many requests. Please wait a moment and try again.", HttpStatus.TOO_MANY_REQUESTS);
        }

        return true;
    }

    private boolean hasValidBearerToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return false;
        }
        String token = authHeader.substring(7).trim();
        if (token.isEmpty()) {
            return false;
        }
        UserRepository userRepository = userRepositoryProvider.getIfAvailable();
        if (userRepository == null) {
            return true;
        }
        return userRepository.findByAuthToken(token).isPresent();
    }

    private boolean allowRequest(String key, int limit) {
        long now = System.currentTimeMillis();
        if (buckets.size() > MAX_BUCKET_ENTRIES) {
            buckets.entrySet().removeIf(entry -> now - entry.getValue().windowStart > WINDOW_MS);
        }

        RateBucket bucket = buckets.compute(key, (k, existing) -> {
            if (existing == null || now - existing.windowStart >= WINDOW_MS) {
                return new RateBucket(now);
            }
            return existing;
        });
        return bucket.count.incrementAndGet() <= limit;
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String forwarded = trimToNull(request.getHeader("X-Forwarded-For"));
        if (forwarded != null) {
            int commaIdx = forwarded.indexOf(',');
            return commaIdx > 0 ? forwarded.substring(0, commaIdx).trim() : forwarded;
        }
        String remoteAddr = request.getRemoteAddr();
        return remoteAddr != null ? remoteAddr : "unknown";
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static final class RateBucket {
        final long windowStart;
        final AtomicInteger count = new AtomicInteger(0);

        RateBucket(long windowStart) {
            this.windowStart = windowStart;
        }
    }
}

