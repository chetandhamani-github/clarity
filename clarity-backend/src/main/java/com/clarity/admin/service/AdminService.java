package com.clarity.admin.service;

import com.clarity.admin.dto.*;
import com.clarity.announcement.entity.Announcement;
import com.clarity.config.entity.AppConfig;
import com.clarity.device.entity.Device;
import com.clarity.feature.entity.FeatureFlag;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.UUID;

public interface AdminService {

    void validateAdminKey(String providedKey);

    AdminStatsResponse getStats();

    AppConfig getAppConfig();

    AppConfig updateAppConfig(UpdateAppConfigRequest request);

    List<FeatureFlag> getAllFeatureFlags();

    FeatureFlag createFeatureFlag(CreateFeatureFlagRequest request);

    FeatureFlag updateFeatureFlag(String key, UpdateFeatureFlagRequest request);

    void deleteFeatureFlag(String key);

    List<Announcement> getAllAnnouncements();

    Announcement createAnnouncement(CreateAnnouncementRequest request);

    Announcement toggleAnnouncement(UUID id);

    void deleteAnnouncement(UUID id);

    Page<Device> getDevices(int page, int size);

    Device updateDeviceStatus(String installationId, UpdateDeviceStatusRequest request);
}
