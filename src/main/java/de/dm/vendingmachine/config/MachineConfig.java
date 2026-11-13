package de.dm.vendingmachine.config;

import de.dm.vendingmachine.catalog.ProductCatalog;
import de.dm.vendingmachine.machine.VendingMachine;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Composition root for the machine aggregate: the only place that knows how a
 * {@link VendingMachine} instance is built from catalog and configuration.
 */
@Configuration
public class MachineConfig {

    @Bean
    public VendingMachine vendingMachine(ProductCatalog catalog, MachineProperties properties) {
        return new VendingMachine(
                catalog.findAll(),
                properties.capacityPerSlot(),
                properties.initialStockPerSlot());
    }
}
