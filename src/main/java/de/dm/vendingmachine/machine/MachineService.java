package de.dm.vendingmachine.machine;

import de.dm.vendingmachine.catalog.ProductCatalog;
import de.dm.vendingmachine.config.MachineProperties;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Application service and composition root of the machine: creates the single
 * {@link VendingMachine} aggregate from catalog and configuration and passes calls
 * through. Controllers depend on this service, never on the aggregate directly.
 */
@Service
public class MachineService {

    private final VendingMachine machine;

    public MachineService(ProductCatalog catalog, MachineProperties properties) {
        this.machine = new VendingMachine(
                catalog.findAll(),
                properties.capacityPerSlot(),
                properties.initialStockPerSlot());
    }

    public MachineView view() {
        return machine.view();
    }

    public MachineView insertCoin(BigDecimal amount) {
        return machine.insertCoin(amount);
    }

    public BigDecimal returnCredit() {
        return machine.returnCredit();
    }

    public PurchaseResult purchase(List<CartLine> lines) {
        return machine.purchase(lines);
    }

    public MachineView refill(List<CartLine> lines) {
        return machine.refill(lines);
    }
}
