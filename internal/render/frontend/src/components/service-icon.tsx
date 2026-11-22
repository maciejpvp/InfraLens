import { Image } from '../ui/image'
import { Text } from '../ui/text'
import { diagramStyles as styles } from './diagram.variants'

export const ServiceIcon = ({ icon }: { icon?: string }) =>
  icon ? (
    <Image className={styles.serviceIcon} src={icon} alt="" aria-hidden="true" />
  ) : (
    <Text className={styles.fallbackIcon} aria-hidden="true">
      ◇
    </Text>
  )
