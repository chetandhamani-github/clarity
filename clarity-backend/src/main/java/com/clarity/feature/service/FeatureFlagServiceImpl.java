package com.clarity.feature.service;

import com.clarity.feature.dto.FeatureFlagResponse;
import com.clarity.feature.entity.FeatureFlag;
import com.clarity.feature.repository.FeatureFlagRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class FeatureFlagServiceImpl implements FeatureFlagService {

    private final FeatureFlagRepository featureFlagRepository;

    @Override
    @Transactional(readOnly = true)
    public List<FeatureFlagResponse> getAllFeatureFlags() {
        log.debug("Fetching all feature flags");
        return featureFlagRepository.findAllByOrderByKeyAsc()
                .stream()
                .map(this::mapToResponse)
                .toList();
    }

    private FeatureFlagResponse mapToResponse(FeatureFlag featureFlag) {
        return FeatureFlagResponse.builder()
                .key(featureFlag.getKey())
                .enabled(featureFlag.isEnabled())
                .build();
    }
}
