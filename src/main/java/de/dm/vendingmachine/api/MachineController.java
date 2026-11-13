package de.dm.vendingmachine.api;

import de.dm.vendingmachine.machine.CartLine;
import de.dm.vendingmachine.machine.MachineService;
import de.dm.vendingmachine.machine.MachineView;
import de.dm.vendingmachine.machine.PurchaseResult;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST API of the machine. There is exactly one machine, so no id appears in the paths.
 * Every mutating call answers with the resulting machine state, which keeps the
 * frontend free of follow-up requests.
 */
@RestController
@RequestMapping("/api/machine")
public class MachineController {

    private final MachineService machine;

    public MachineController(MachineService machine) {
        this.machine = machine;
    }

    @GetMapping
    public MachineView state() {
        return machine.view();
    }

    @PostMapping("/credit")
    public MachineView insertCredit(@Valid @RequestBody InsertCreditRequest request) {
        return machine.insertCoin(request.amount());
    }

    @PostMapping("/credit/return")
    public ReturnedCreditResponse returnCredit() {
        return new ReturnedCreditResponse(machine.returnCredit());
    }

    @PostMapping("/purchase")
    public PurchaseResult purchase(@Valid @RequestBody PositionsRequest request) {
        return machine.purchase(toLines(request));
    }

    @PostMapping("/refill")
    public MachineView refill(@Valid @RequestBody PositionsRequest request) {
        return machine.refill(toLines(request));
    }

    private static List<CartLine> toLines(PositionsRequest request) {
        return request.items().stream()
                .map(item -> new CartLine(item.productId(), item.quantity()))
                .toList();
    }
}
