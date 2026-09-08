import { describe, expect, it } from 'vitest';

import { firstMobile, parsePhone, parsePhoneList, toWhatsappNumber } from '@/lib/validation/phone';

describe('phone', () => {
  it('parseia celular e monta wa.me', () => {
    const parsed = parsePhone('11-999998888');
    expect(parsed?.isMobile).toBe(true);
    expect(toWhatsappNumber('11-999998888')).toBe('5511999998888');
  });

  it('parseia celular com DDI 55', () => {
    expect(parsePhone('5538998100827')?.digits).toBe('38998100827');
  });

  it('rejeita DDD inválido; número válido (celular ou fixo) monta JID', () => {
    expect(parsePhone('00-999998888')).toBeNull();
    expect(toWhatsappNumber('61-34871776')).toBe('556134871776');
  });

  it('lista telefones sem repetir e acha o primeiro celular', () => {
    const list = parsePhoneList('61-34871776,11-999998888,11-999998888');
    expect(list).toHaveLength(2);
    expect(firstMobile(list)?.digits).toBe('11999998888');
  });
});
