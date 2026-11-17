package de.dm.vendingmachine.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class MachinePropertiesTest {

    @Test
    void acceptsZeroInitialStockAndRetainsConfiguredCapacity() {
        MachineProperties properties = new MachineProperties(12, 0);

        assertThat(properties.capacityPerSlot()).isEqualTo(12);
        assertThat(properties.initialStockPerSlot()).isZero();
    }

    @Test
    void rejectsNonPositiveCapacity() {
        assertThatThrownBy(() -> new MachineProperties(0, 3))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("machine.capacity-per-slot must be positive");
        assertThatThrownBy(() -> new MachineProperties(-1, 3))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("machine.capacity-per-slot must be positive");
    }

    @Test
    void rejectsNegativeInitialStock() {
        assertThatThrownBy(() -> new MachineProperties(10, -1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("machine.initial-stock-per-slot must not be negative");
    }
}
