import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock del modulo AuthContext: login()/logout() controlados por el test.
const loginMock = vi.fn();
vi.mock('../src/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    login: loginMock,
    logout: vi.fn(),
    user: null,
    loading: false,
  }),
}));

const { default: LoginPage } = await import('../src/pages/LoginPage.jsx');

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('renderiza el titulo, los campos y el boton', () => {
    renderWithRouter();
    expect(screen.getByText(/DocScan Finance CR/i)).toBeInTheDocument();
    expect(screen.getByText(/iniciar sesion/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contrasena/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument();
  });

  it('valida formato de correo invalido sin llamar al backend', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await user.type(screen.getByLabelText(/correo/i), 'no-es-email');
    await user.type(screen.getByLabelText(/contrasena/i), 'algo');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByText(/correo invalido/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('llama a login con email y password al enviar', async () => {
    loginMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithRouter();
    await user.type(screen.getByLabelText(/correo/i), 'admin@docscan.local');
    await user.type(screen.getByLabelText(/contrasena/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));
    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('admin@docscan.local', 'secret123');
    });
  });

  it('muestra mensaje de error si login falla', async () => {
    loginMock.mockRejectedValue({ response: { data: { message: 'Credenciales invalidas' } } });
    const user = userEvent.setup();
    renderWithRouter();
    await user.type(screen.getByLabelText(/correo/i), 'admin@docscan.local');
    await user.type(screen.getByLabelText(/contrasena/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByText(/credenciales invalidas/i)).toBeInTheDocument();
  });
});
