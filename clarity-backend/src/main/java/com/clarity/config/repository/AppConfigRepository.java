package com.clarity.config.repository;

import com.clarity.config.entity.AppConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AppConfigRepository extends JpaRepository<AppConfig, UUID> {

    Optional<AppConfig> findTopByOrderByUpdatedAtDesc();
}
