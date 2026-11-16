package de.dm.vendingmachine.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Machine configuration from {@code machine.*} in application.yml, validated once at
 * startup instead of scattering {@code @Value} lookups through the code.
 */
@ConfigurationProperties(prefix = "machine")
public record MachineProperties(
        @DefaultValue("10") int capacityPerSlot,
        @DefaultValue("3") int initialStockPerSlot) {

    public MachineProperties {
        if (capacityPerSlot <= 0) {
            throw new IllegalArgumentException("machine.capacity-per-slot must be positive");
        }
        if (initialStockPerSlot < 0) {
            throw new IllegalArgumentException("machine.initial-stock-per-slot must not be negative");
        }
    }
}
