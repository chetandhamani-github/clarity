package com.clarity.admin.service;

import com.clarity.admin.dto.*;
import com.clarity.announcement.entity.Announcement;
import com.clarity.announcement.repository.AnnouncementRepository;
import com.clarity.config.entity.AppConfig;
import com.clarity.config.repository.AppConfigRepository;
import com.clarity.device.entity.Device;
import com.clarity.device.repository.DeviceRepository;
import com.clarity.exception.ApiException;
import com.clarity.exception.ResourceNotFoundException;
import com.clarity.feature.entity.FeatureFlag;
import com.clarity.feature.repository.FeatureFlagRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminServiceImpl implements AdminService {

    @Value("${clarity.admin.secret-key:}")
    private String adminSecretKey;

    private final AppConfigRepository appConfigRepository;
    private final FeatureFlagRepository featureFlagRepository;
    private final AnnouncementRepository announcementRepository;
    private final DeviceRepository deviceRepository;

    @Override
    public void validateAdminKey(String providedKey) {
        if (adminSecretKey == null || adminSecretKey.trim().isEmpty()) {
            throw new ApiException("Admin endpoints are disabled: ADMIN_SECRET_KEY is not configured", HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (providedKey == null || providedKey.trim().isEmpty()) {
            throw new ApiException("Invalid or missing X-Admin-Key header", HttpStatus.UNAUTHORIZED);
        }
        byte[] expected = adminSecretKey.trim().getBytes(StandardCharsets.UTF_8);
        byte[] actual = providedKey.trim().getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new ApiException("Invalid or missing X-Admin-Key header", HttpStatus.UNAUTHORIZED);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public AdminStatsResponse getStats() {
        AppConfig config = getAppConfig();
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);

        return AdminStatsResponse.builder()
                .totalDevices(deviceRepository.count())
                .activeDevicesLast7Days(deviceRepository.countByLastSeenAfter(sevenDaysAgo))
                .maintenanceMode(config.isMaintenanceMode())
                .minAppVersion(config.getMinVersion())
                .latestAppVersion(config.getLatestVersion())
                .activeAnnouncements(announcementRepository.findByActiveTrueOrderByCreatedAtDesc().size())
                .totalFeatureFlags(featureFlagRepository.count())
                .databaseStatus("Connected (PostgreSQL / Neon)")
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AppConfig getAppConfig() {
        return appConfigRepository.findTopByOrderByUpdatedAtDesc()
                .orElseGet(() -> AppConfig.builder()
                        .minVersion("1.0.0")
                        .latestVersion("1.0.0")
                        .maintenanceMode(false)
                        .build());
    }

    @Override
    @Transactional
    public AppConfig updateAppConfig(UpdateAppConfigRequest request) {
        AppConfig config = appConfigRepository.findTopByOrderByUpdatedAtDesc()
                .orElseGet(() -> AppConfig.builder().build());

        config.setMinVersion(request.getMinVersion().trim());
        config.setLatestVersion(request.getLatestVersion().trim());
        config.setMaintenanceMode(request.isMaintenanceMode());
        config.setUpdatedAt(Instant.now());

        log.info("Admin updated application configuration: minVersion={}, latestVersion={}, maintenanceMode={}",
                config.getMinVersion(), config.getLatestVersion(), config.isMaintenanceMode());
        return appConfigRepository.save(config);
    }

    @Override
    @Transactional(readOnly = true)
    public List<FeatureFlag> getAllFeatureFlags() {
        return featureFlagRepository.findAllByOrderByKeyAsc();
    }

    @Override
    @Transactional
    public FeatureFlag createFeatureFlag(CreateFeatureFlagRequest request) {
        String key = request.getKey().trim().toLowerCase();
        if (featureFlagRepository.findByKey(key).isPresent()) {
            throw new ApiException("Feature flag already exists with key: " + key, HttpStatus.CONFLICT);
        }

        FeatureFlag flag = FeatureFlag.builder()
                .key(key)
                .enabled(request.isEnabled())
                .description(request.getDescription())
                .updatedAt(Instant.now())
                .build();

        log.info("Admin created feature flag: key={}, enabled={}", key, flag.isEnabled());
        return featureFlagRepository.save(flag);
    }

    @Override
    @Transactional
    public FeatureFlag updateFeatureFlag(String key, UpdateFeatureFlagRequest request) {
        FeatureFlag flag = featureFlagRepository.findByKey(key)
                .orElseThrow(() -> new ResourceNotFoundException("Feature flag not found with key: " + key));

        flag.setEnabled(request.isEnabled());
        if (request.getDescription() != null) {
            flag.setDescription(request.getDescription());
        }
        flag.setUpdatedAt(Instant.now());

        log.info("Admin updated feature flag: key={}, enabled={}", key, flag.isEnabled());
        return featureFlagRepository.save(flag);
    }

    @Override
    @Transactional
    public void deleteFeatureFlag(String key) {
        FeatureFlag flag = featureFlagRepository.findByKey(key)
                .orElseThrow(() -> new ResourceNotFoundException("Feature flag not found with key: " + key));
        featureFlagRepository.delete(flag);
        log.info("Admin deleted feature flag: key={}", key);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Announcement> getAllAnnouncements() {
        return announcementRepository.findAllByOrderByCreatedAtDesc();
    }

    @Override
    @Transactional
    public Announcement createAnnouncement(CreateAnnouncementRequest request) {
        Announcement announcement = Announcement.builder()
                .title(request.getTitle().trim())
                .message(request.getMessage().trim())
                .active(request.isActive())
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        log.info("Admin created announcement: title={}, active={}", announcement.getTitle(), announcement.isActive());
        return announcementRepository.save(announcement);
    }

    @Override
    @Transactional
    public Announcement toggleAnnouncement(UUID id) {
        Announcement announcement = announcementRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Announcement not found with id: " + id));

        announcement.setActive(!announcement.isActive());
        announcement.setUpdatedAt(Instant.now());

        log.info("Admin toggled announcement: id={}, active={}", id, announcement.isActive());
        return announcementRepository.save(announcement);
    }

    @Override
    @Transactional
    public void deleteAnnouncement(UUID id) {
        if (!announcementRepository.existsById(id)) {
            throw new ResourceNotFoundException("Announcement not found with id: " + id);
        }
        announcementRepository.deleteById(id);
        log.info("Admin deleted announcement: id={}", id);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<Device> getDevices(int page, int size) {
        return deviceRepository.findAllByOrderByLastSeenDesc(PageRequest.of(Math.max(0, page), Math.max(1, size)));
    }

    @Override
    @Transactional
    public Device updateDeviceStatus(String installationId, UpdateDeviceStatusRequest request) {
        Device device = deviceRepository.findByInstallationId(installationId)
                .orElseThrow(() -> new ResourceNotFoundException("Device not found with installationId: " + installationId));

        device.setStatus(request.getStatus());
        device.setUpdatedAt(Instant.now());

        log.info("Admin updated device status: installationId={}, status={}", installationId, request.getStatus());
        return deviceRepository.save(device);
    }
}
