package de.dm.vendingmachine.api;

import de.dm.vendingmachine.machine.MachineError;
import de.dm.vendingmachine.machine.MachineException;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.converter.HttpMessageNotReadableException;

/**
 * Translates domain and validation failures into RFC 9457 problem responses. Clients get
 * a stable {@code code} property, so the frontend can distinguish "sold out" from
 * "not enough credit" without parsing prose.
 */
@RestControllerAdvice
public class MachineExceptionHandler {

    @ExceptionHandler(MachineException.class)
    public ProblemDetail handleMachineException(MachineException exception) {
        return problem(statusOf(exception.getCode()), exception.getCode().name(), exception.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidationException(MethodArgumentNotValidException exception) {
        String detail = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return problem(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                detail.isEmpty() ? "Request is not valid" : detail);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableBody(HttpMessageNotReadableException exception) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request body is missing or malformed");
    }

    private static HttpStatus statusOf(MachineError code) {
        return switch (code) {
            case UNKNOWN_PRODUCT -> HttpStatus.NOT_FOUND;
            case INSUFFICIENT_STOCK, INSUFFICIENT_CREDIT, SLOT_CAPACITY_EXCEEDED -> HttpStatus.CONFLICT;
            case INVALID_COIN, INVALID_QUANTITY -> HttpStatus.BAD_REQUEST;
        };
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(status, detail);
        problemDetail.setTitle(status.getReasonPhrase());
        problemDetail.setProperty("code", code);
        return problemDetail;
    }
}
