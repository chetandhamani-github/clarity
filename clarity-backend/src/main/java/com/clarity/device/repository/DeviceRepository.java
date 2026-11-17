package com.clarity.device.repository;

import com.clarity.device.entity.Device;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DeviceRepository extends JpaRepository<Device, UUID> {

    Optional<Device> findByInstallationId(String installationId);

    boolean existsByInstallationId(String installationId);

    Page<Device> findAllByOrderByLastSeenDesc(Pageable pageable);

    long countByLastSeenAfter(Instant timestamp);
}
