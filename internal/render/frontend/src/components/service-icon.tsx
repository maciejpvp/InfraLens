import { Image } from '../ui/image'
import { Text } from '../ui/text'

export function ServiceIcon({ icon }: { icon?: string }) {
  if (icon) {
    return <Image className="service-icon size-6 shrink-0 object-contain" src={icon} alt="" aria-hidden="true" />
  }

  return (
    <Text className="grid size-6 shrink-0 place-items-center text-[11px] font-semibold text-foreground" aria-hidden="true">
      ◇
    </Text>
  )
}
