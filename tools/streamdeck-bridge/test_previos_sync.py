import unittest
from unittest.mock import patch

import previos


class StreamDeckSyncTest(unittest.TestCase):
    def test_same_server_time_for_selected_pcs(self):
        config = {
            'destinos': [('03', 'pc03'), ('04', 'pc04'), ('05', 'pc05'), ('MBP14', 'mac')],
            'sincro': ['03', '04', '05'], 'bucle': ['mac'],
        }
        def order(screen, cmd):
            return {'ok': True, 'screen': screen, 'cmd': cmd}
        selected = {'03': True, '04': True, '05': False, 'MBP14': True}
        with patch.object(previos, 'seleccion', return_value=selected), \
                patch.object(previos, 'traer', return_value={
                    'ok': True, 'protocol': 'admira-clock-v1', 'serverSentAt': 1794822600000,
                }) as clock, patch.object(previos, 'orden', side_effect=order):
            result = previos.saltar(2044, config)
        clock.assert_called_once_with(previos.CLOCK, espera=5)
        at = 1794822600000 + previos.ADELANTO_MS
        self.assertEqual({r['screen']: r['cmd'] for r in result}, {
            'pc03': f'playat-2044-{at}', 'pc04': f'playat-2044-{at}', 'mac': 'loop2044',
        })

    def test_missing_shared_clock_does_not_send_uncoordinated_play(self):
        config = {'destinos': [('03', 'pc03'), ('04', 'pc04')], 'sincro': ['03', '04']}
        with patch.object(previos, 'seleccion', return_value={'03': True, '04': True}), \
                patch.object(previos, 'traer', side_effect=OSError('offline')), \
                patch.object(previos, 'orden') as order:
            result = previos.saltar(2044, config)
        order.assert_not_called()
        self.assertEqual([r['ok'] for r in result], [False, False])


if __name__ == '__main__':
    unittest.main()
