package com.clarity.feature.service;

import com.clarity.feature.dto.FeatureFlagResponse;

import java.util.List;

public interface FeatureFlagService {

    List<FeatureFlagResponse> getAllFeatureFlags();
}
