package de.dm.vendingmachine.machine;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Application service: the seam between the web layer and the machine aggregate.
 * Controllers depend on this service, never on the aggregate directly.
 */
@Service
public class MachineService {

    private final VendingMachine machine;

    public MachineService(VendingMachine machine) {
        this.machine = machine;
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
