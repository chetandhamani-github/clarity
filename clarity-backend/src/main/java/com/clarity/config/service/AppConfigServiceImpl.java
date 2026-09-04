package com.clarity.config.service;

import com.clarity.config.dto.AppConfigResponse;
import com.clarity.config.entity.AppConfig;
import com.clarity.config.repository.AppConfigRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AppConfigServiceImpl implements AppConfigService {

    private static final String DEFAULT_MIN_VERSION = "1.0.0";
    private static final String DEFAULT_LATEST_VERSION = "1.0.0";
    private static final boolean DEFAULT_MAINTENANCE_MODE = false;

    private final AppConfigRepository appConfigRepository;

    @Override
    @Transactional(readOnly = true)
    public AppConfigResponse getAppConfig() {
        log.debug("Retrieving current application configuration");
        return appConfigRepository.findTopByOrderByUpdatedAtDesc()
                .map(this::mapToResponse)
                .orElseGet(this::getDefaultConfig);
    }

    private AppConfigResponse mapToResponse(AppConfig config) {
        return AppConfigResponse.builder()
                .minVersion(config.getMinVersion())
                .latestVersion(config.getLatestVersion())
                .maintenanceMode(config.isMaintenanceMode())
                .build();
    }

    private AppConfigResponse getDefaultConfig() {
        log.info("No app configuration record found in database. Returning fallback defaults.");
        return AppConfigResponse.builder()
                .minVersion(DEFAULT_MIN_VERSION)
                .latestVersion(DEFAULT_LATEST_VERSION)
                .maintenanceMode(DEFAULT_MAINTENANCE_MODE)
                .build();
    }
}
