package com.clarity.announcement.service;

import com.clarity.announcement.dto.AnnouncementResponse;
import com.clarity.announcement.entity.Announcement;
import com.clarity.announcement.repository.AnnouncementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnnouncementServiceImpl implements AnnouncementService {

    private final AnnouncementRepository announcementRepository;

    @Override
    @Transactional(readOnly = true)
    public List<AnnouncementResponse> getActiveAnnouncements() {
        log.debug("Fetching active announcements");
        return announcementRepository.findByActiveTrueOrderByCreatedAtDesc()
                .stream()
                .map(this::mapToResponse)
                .toList();
    }

    private AnnouncementResponse mapToResponse(Announcement announcement) {
        return AnnouncementResponse.builder()
                .id(announcement.getId())
                .title(announcement.getTitle())
                .message(announcement.getMessage())
                .createdAt(announcement.getCreatedAt())
                .build();
    }
}
