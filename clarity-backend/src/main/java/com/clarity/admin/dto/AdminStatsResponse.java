package com.clarity.admin.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AdminStatsResponse {
    private long totalDevices;
    private long activeDevicesLast7Days;
    private boolean maintenanceMode;
    private String minAppVersion;
    private String latestAppVersion;
    private long activeAnnouncements;
    private long totalFeatureFlags;
    private String databaseStatus;
}
